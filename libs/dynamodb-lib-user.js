import { dynamoDb } from 'blob-common/core/db';

export const getUser = async (userId) => {
    const params = {
        Key: {
            PK: 'USER',
            SK: userId,
        }
    };
    const result = await dynamoDb.get(params);
    const oldUser = result.Item;
    if (!oldUser) {
        console.log(result);
        throw new Error("User not found.");
    }
    return oldUser;
};

export const getUserByCognitoId = async (cognitoId) => {
    const params = {
        IndexName: process.env.cognitoIndex,
        KeyConditionExpression: '#c = :c',
        ExpressionAttributeNames: { '#c': 'cognitoId' },
        ExpressionAttributeValues: { ':c': cognitoId },
    };
    const result = await dynamoDb.query(params);
    const items = result.Items;
    if (!items || items.length === 0) {
        console.log(`no user found with cognitoId "${cognitoId}"`);
        return undefined;
    };

    const userId = items[0].SK;
    return await getUser(userId);
};
