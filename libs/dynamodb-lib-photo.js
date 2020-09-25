import { dynamoDb } from 'blob-common/core/db';

export const listPhotoPublications = async (photoId) => {
    const params = {
        IndexName: process.env.photoIndex,
        KeyConditionExpression: "#p = :pid and begins_with(PK, :p)",
        ExpressionAttributeNames: {
            '#p': 'SK',
        },
        ExpressionAttributeValues: {
            ":pid": photoId,
            ":p": 'GP',
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items;
    return items || [];
};