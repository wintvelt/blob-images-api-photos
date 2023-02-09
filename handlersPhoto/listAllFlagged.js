// Returns personal photos flagged by others
import { dynamoDb } from "blob-common/core/db";
import { handler, getUserFromEvent } from "blob-common/core/handler";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const isWebmaster = (userId === process.env.webmasterId);
    if (!isWebmaster) return { isWebmaster: false };

    const params = {
        IndexName: process.env.flaggedIndex,
        KeyConditionExpression: "#f = :f",
        ExpressionAttributeNames: {
            '#f': 'flagged',
        },
        ExpressionAttributeValues: {
            ":f": 'flagged',
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items || [];
    return { isWebmaster: true, photos: items };
});