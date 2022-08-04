// Checks for all users if their photo count is still OK
// event may contain userId - to only check for 1 user

import { handler } from "blob-common/core/handler";
import { s3 } from "blob-common/core/s3";
// import AWS from "aws-sdk";
import { dynamoDb } from "blob-common/core/db";

// const lambdaFunc = new AWS.Lambda();
// const lambdaParams = {
//     FunctionName: process.env.createPhotoArn,
//     InvocationType: 'RequestResponse',
//     LogType: 'Tail'
// };
// const lambda = {
//     invoke: (event) => lambdaFunc.invoke({ ...lambdaParams, Payload: JSON.stringify(event) }).promise()
// };

// to turn list of keys into object with stats
const keyReducer = (outObj, key, i, inArr) => {
    const userId = key.split('/')[1];
    const userItem = outObj[userId] || { s3: 0, db: -1 };
    const newUserItem = { ...userItem, s3: userItem.s3 + 1 };
    // skip empty userId = key for the folder itself
    return (userId) ?
        { ...outObj, [userId]: newUserItem }
        : { ...outObj };
};

// to classify a user
const getKey = (element) => (element.s3 === element.db) ?
    'okInBoth'
    : (element.db === -1) ?
        'onlyInS3'
        : (element.s3 === -1) ?
            (element.db === 0) ? 'noPhotos' : 'onlyInDb'
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
        let userItem = countObj[userId] || { s3: -1, db: 0 };
        countObj[userId] = { ...userItem, db: dbItem.photoCount };
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
    const mismatchKeys = summaryObj.mismatch;
    let promises = [];
    mismatchKeys.forEach(key => {
        promises.push(dynamoDb.query({
            IndexName: process.env.photoIndex,
            KeyConditionExpression: "#sk = :sk",
            ExpressionAttributeNames: {
                '#sk': 'SK',
            },
            ExpressionAttributeValues: {
                ":sk": 'U' + key,
            }
        }));
    });
    const realDbPhotos = await promises;
    mismatchKeys.forEach((key, i) => {
        countObj[key] = { ...countObj[key], dbReal: realDbPhotos[i].Count };
    });
    // print results
    if (!userId) {
        console.table(Object.keys(summaryObj).map(key => ({
            stat: key,
            count: summaryObj[key].length
        })));

        console.log(summaryObj);
    } else {
        console.log(`user classified as "${getKey(countObj[userId])}"`);
    };
    console.table(countObj);

    return `OK`;
});