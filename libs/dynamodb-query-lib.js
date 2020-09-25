import { dynamoDb } from 'blob-common/core/db';

export const listPhotosByDate = async (userId) => {
    const params = {
        IndexName: process.env.dateIndex,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
            '#pk': 'PK',
        },
        ExpressionAttributeValues: {
            ":PK": 'PO' + userId,
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items;
    return items || [];
};

export const listPhotoRatings = async (photoId) => {
    const params = {
        KeyConditionExpression: "#pk = :pid",
        ExpressionAttributeNames: {
            '#pk': 'PK',
        },
        ExpressionAttributeValues: {
            ":pid": 'UF' + photoId,
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items || [];
    return items;
};