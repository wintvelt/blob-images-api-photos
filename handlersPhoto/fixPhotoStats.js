// Checks for all users if their photo count is still OK
// event may contain userId - to only check for 1 user

import { handler } from "blob-common/core/handler";
import { s3 } from "blob-common/core/s3";
import { dbUpdateMulti, dynamoDb } from "blob-common/core/db";

// helper to turn list of keys into object with stats
const keyReducer = (outObj, key, i, inArr) => {
    const userId = key.split('/')[1];
    const userItem = outObj[userId] || { s3Count: 0, dbStats: -1 };
    const newUserItem = { ...userItem, s3Count: userItem.s3Count + 1 };
    // skip empty userId = key for the folder itself
    return (userId) ?
        { ...outObj, [userId]: newUserItem }
        : { ...outObj };
};

// to classify a user
const getKey = (element) => (element.s3Count === element.dbStats) ?
    'okInBoth'
    : (element.dbStats === -1) ?
        'onlyInS3'
        : (element.s3Count === -1) ?
            (element.dbStats === 0) ? 'noPhotos' : 'onlyInDb'
            : 'mismatch';

export const main = handler(async (event, context) => {
    // list files from protected folder on S3
    const { userId } = event;
    const preFix = (userId) ? `protected/${userId}/` : `protected/`;
    let keysFromS3 = [];
    let continuationToken = '';
    do {
        let params = { Prefix: preFix };
        if (continuationToken) params.ContinuationToken = continuationToken;
        const fileList = await s3.list(params);
        const contents = fileList.Contents || [];
        // collect keys from output
        const newKeys = contents.map(item => item.Key);
        keysFromS3 = [...keysFromS3, ...newKeys];
        // continue loop if there is more to fetch
        continuationToken = fileList.NextContinuationToken || '';
    } while (continuationToken);

    // count s3 photos per user - into mutable object
    let countObj = keysFromS3.reduce(keyReducer, {});

    // retrieve stats for all users
    const dbQuery = (userId) ?
        await dynamoDb.get({
            Key: {
                PK: 'UPstats',
                SK: 'U' + userId
            }
        })
        : await dynamoDb.query({
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: {
                '#pk': 'PK',
            },
            ExpressionAttributeValues: {
                ":pk": 'UPstats',
            }
        });
    const dbStats = (dbQuery.Items) ?
        dbQuery.Items
        : (dbQuery.Item) ?
            [dbQuery.Item]
            : [];

    // add db stats to raw countObj
    for (let i = 0; i < dbStats.length; i++) {
        const dbItem = dbStats[i];
        const userId = dbItem.SK.slice(1);
        let userItem = countObj[userId] || { s3Count: -1, dbStats: 0 };
        countObj[userId] = { ...userItem, dbStats: dbItem.photoCount };
    };

    // create summary
    let summaryObj = {
        okInBoth: [],
        noPhotos: [],
        mismatch: [],
        onlyInS3: [],
        onlyInDb: []
    };

    for (const userId in countObj) {
        if (Object.hasOwnProperty.call(countObj, userId)) {
            const element = countObj[userId];
            const key = getKey(element);
            summaryObj[key] = [...summaryObj[key], userId];
        }
    }

    // get real db photo count for mismatches
    const mismatchKeys = summaryObj.mismatch; // 1 key per user
    let promises = [];
    mismatchKeys.forEach(key => {
        promises.push(dynamoDb.query({
            IndexName: process.env.photoIndex,
            KeyConditionExpression: "#sk = :sk and begins_with(PK, :p)",
            ExpressionAttributeNames: {
                '#sk': 'SK'
            },
            ExpressionAttributeValues: {
                ":sk": 'U' + key,
                ':p': 'PO'
            }
        }));
    });
    const realDbPhotos = await Promise.all(promises);
    mismatchKeys.forEach((key, i) => {
        countObj[key] = { ...countObj[key], dbCount: realDbPhotos[i].Count };
    });

    // print results
    if (!userId) {
        console.table(Object.keys(summaryObj).map(key => ({
            stat: key,
            count: summaryObj[key].length
        })));

        console.log(summaryObj);
    };

    console.table(countObj);

    if (userId) {
        const userClass = getKey(countObj[userId]);
        console.log(`user classified as "${userClass}"`);

        const userDbPhotos = realDbPhotos[0].Items;

        if (userClass === 'mismatch' && userDbPhotos) {
            // compare each photo key for this user
            let photoObj = {};
            userDbPhotos.forEach(photo => {
                const photoKey = photo.url.split('/')[2];
                photoObj[photoKey] = { photoId: photo.PK, inDb: true };
            });
            keysFromS3.forEach(key => {
                const photoKey = key.split('/')[2];
                if (photoKey) {
                    const photoItem = photoObj[photoKey] || {};
                    photoObj[photoKey] = { ...photoItem, inS3: true };
                }
            });
            const allPhotosOK = Object.keys(photoObj).some(photoKey => (
                !(photoObj[photoKey].inDb && photoObj[photoKey].inS3)
            ));
            if (allPhotosOK) {
                const userPhotoCount = Object.keys(photoObj.length);
                console.log(`All ${userPhotoCount} user photos are in db and in S3, repairing user stats`);
                await dbUpdateMulti('UPstats', 'U' + userId, {
                    photoCount: userPhotoCount,
                    prevPhotoCount: userPhotoCount
                });
            } else {
                console.table(photoObj);
            }
        }
    }

    return `OK`;
});