import { handler } from "blob-common/core/handler";
import { dynamoDb } from "blob-common/core/db";
import { s3 } from 'blob-common/core/s3';

import { getMembershipsAndInvites, getMembers } from "../libs/dynamodb-lib-memberships";
import { listPhotoRatings } from "../libs/dynamodb-query-lib";
import { listPhotoPublications } from "../libs/dynamodb-lib-photo";

const groupUpdate = (photoUrl) => (group) => {
    return dynamoDb.update({
        TableName: process.env.photoTable,
        Key: {
            PK: 'GBbase',
            SK: group.SK
        },
        UpdateExpression: "REMOVE #image, #imageUrl",
        ConditionExpression: '#imageUrl = :photoUrl',
        ExpressionAttributeNames: {
            '#image': 'image',
            '#imageUrl': 'imageUrl',
        },
        ExpressionAttributeValues: {
            ":photoUrl": photoUrl,
        },
    });
};
const albumUpdate = (photoUrl) => (album) => {
    return dynamoDb.update({
        TableName: process.env.photoTable,
        Key: {
            PK: album.PK,
            SK: album.SK
        },
        UpdateExpression: "REMOVE #image, #imageUrl",
        ConditionExpression: '#imageUrl = :photoUrl',
        ExpressionAttributeNames: {
            '#image': 'image',
            '#imageUrl': 'imageUrl',
        },
        ExpressionAttributeValues: {
            ":photoUrl": photoUrl,
        },
    });
};
const albumPhotoUpdate = (photoId) => (album) => {
    return dynamoDb.delete({
        TableName: process.env.photoTable,
        Key: {
            PK: `GP${album.group.id}#${album.SK}`,
            SK: photoId
        },
    });
};
const userUpdate = (photoUrl) => (userId) => ({
    TableName: process.env.photoTable,
    Key: {
        PK: 'UBbase',
        SK: userId
    },
    UpdateExpression: "REMOVE #avatar",
    ConditionExpression: '#avatar = :photoUrl',
    ExpressionAttributeNames: {
        '#avatar': 'avatar',
    },
    ExpressionAttributeValues: {
        ":photoUrl": photoUrl,
    },
});

const ratingDelete = (rating) => {
    return dynamoDb.delete({
        TableName: process.env.photoTable,
        Key: {
            PK: rating.PK,
            SK: rating.SK
        },
    });
};

const deleteFromSeenPics = async (photoId, userId) => {
    // get all user publications
    const publications = await listPhotoPublications(photoId);
    const groupAlbums = publications.map(pub => pub.PK.slice(2));

    let seenPicsPromises = [];
    for (let i = 0; i < groupAlbums.length; i++) {
        const groupAlbum = groupAlbums[i];
        const [groupId, albumId] = groupAlbum.split('#');
        // remove from other users unseen list
        const members = await getMembers(groupId);
        const picKey = `${albumId}#${photoId}`;
        for (let j = 0; j < members.length; j++) {
            const member = members[j];
            if (member.PK.slice(2) !== userId) {
                const oldSeenPics = member.seenPics || [];
                const newSeenPics = oldSeenPics.filter(pic => (pic.albumPhoto !== picKey));
                if (oldSeenPics.length > newSeenPics.length) {
                    const delPhotoUpdate = dynamoDb.update({
                        TableName: process.env.photoTable,
                        Key: {
                            PK: member.PK,
                            SK: member.SK
                        },
                        UpdateExpression: 'SET #s = :ns',
                        ExpressionAttributeNames: { '#s': 'seenPics' },
                        ExpressionAttributeValues: { ':ns': newSeenPics }
                    });
                    seenPicsPromises.push(delPhotoUpdate);
                }
            }
        }
    }
    return seenPicsPromises;
};


export const main = handler(async (event, context) => {
    const userId = 'U' + event.requestContext.identity.cognitoIdentityId;

    const photoParams = {
        TableName: process.env.photoTable,
        Key: {
            PK: 'PO' + event.pathParameters.id,
            SK: userId,
        },
        ReturnValues: "ALL_OLD"
    };

    const result = await dynamoDb.delete(photoParams);
    if (!result.Attributes) {
        throw new Error("Photo not found.");
    };
    const photoUrl = result.Attributes.url;
    const photoId = result.Attributes.PK.slice(2);

    const groups = await getMembershipsAndInvites(userId);
    const groupAlbums = await Promise.all(groups.map(group => dynamoDb.query({
        TableName: process.env.photoTable,
        KeyConditionExpression: "#PK = :group",
        ExpressionAttributeNames: {
            '#PK': 'PK',
        },
        ExpressionAttributeValues: {
            ":group": `GA${group.SK}`,
        },
    })));
    const albums = groupAlbums.reduce((acc, alb) => ([...acc, ...alb.Items]), []);

    const ratings = await listPhotoRatings(photoId);

    const removeFromUnseenList = deleteFromSeenPics(photoId, userId);

    try {
        await Promise.all([
            ...groups.filter(group => (group.imageUrl === photoUrl)).map(groupUpdate(photoUrl)),
            ...albums.filter(album => (album.imageUrl === photoUrl)).map(albumUpdate(photoUrl)),
            ...albums.map(albumPhotoUpdate(photoId)),
            ...ratings.map(ratingDelete),
            ...removeFromUnseenList,
            dynamoDb.update(userUpdate(photoUrl)(userId)),
            s3.delete({
                Key: photoUrl
            }),
        ]);
    } catch (error) {
        console.log(error);
    }

    return 'ok';
});
