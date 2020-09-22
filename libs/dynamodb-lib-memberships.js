import { dynamoDb } from 'blob-common/core/db';
import { now, expireDate } from 'blob-common/core/date';

export const getMembershipsAndInvites = async (userId) => {
    const params = {
        TableName: process.env.photoTable,
        KeyConditionExpression: "#u = :member",
        ExpressionAttributeNames: {
            '#u': 'PK',
        },
        ExpressionAttributeValues: {
            ":member": 'UM' + userId,
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items || [];

    const today = now();
    return items.filter(item => item.status !== 'invite' || expireDate(item.createdAt) >= today);
};

const getMembersAndInvites = async (groupId) => {
    const params = {
        TableName: process.env.photoTable,
        IndexName: process.env.photoIndex,
        KeyConditionExpression: "#g = :grp and begins_with(PK, :p)",
        ExpressionAttributeNames: {
            '#g': 'SK',
        },
        ExpressionAttributeValues: {
            ":grp": groupId,
            ":p": 'UM',
        },
    };

    const result = await dynamoDb.query(params);
    const items = result.Items;
    if (!items) {
        throw new Error("members retrieval failed.");
    };
    const today = now();
    return items.filter(item => item.status !== 'invite' || expireDate(item.createdAt) >= today);
};

export const getMembers = async (groupId) => {
    const items = await getMembersAndInvites(groupId);
    return items.filter(item => item.status !== 'invite');
};