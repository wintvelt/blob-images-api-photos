import { dynamoDb } from 'blob-common/core/db';
import { cleanRecord } from 'blob-common/core/dbClean';
import { listPhotoPublications } from './dynamodb-lib-photo';
import { getMemberships } from './dynamodb-lib-memberships';

const getMember = async (userId, groupId) => {
    const memberParams = {
        Key: {
            PK: 'UM' + userId,
            SK: groupId
        },
    };
    const result = await dynamoDb.get(memberParams);
    return (result.Item);
};
export const getMemberRole = async (userId, groupId) => {
    const membership = await getMember(userId, groupId);
    return membership && (membership.status !== 'invite') && membership.role;
};
export const checkUser = async (userId, groupId) => {
    const groupRole = await getMemberRole(userId, groupId);
    return (!!groupRole);
};

export const getPhotoByUser = async (photoId, userId) => {
    const params = {
        Key: {
            PK: 'PO' + photoId,
            SK: userId,
        }
    };
    console.log({ table: process.env.photoTable, params });
    const result = await dynamoDb.get(params);
    if (!result.Item) return undefined;

    // Return the retrieved item
    return result.Item;
};

const getGroupId = (key) => key.split('#')[0].slice(2);

export const getPhotoById = async (photoId, userId) => {
    // returns photo if user has any access
    const photo = await getPhotoByUser(photoId, userId);
    if (photo) return photo;

    // get all publications and return if user is member of any
    const publications = await listPhotoPublications(photoId);
    const memberships = await getMemberships(userId);
    const groupsWithUser = memberships.map(mem => mem.SK);
    const pubsWithMembership = publications.filter(pub => groupsWithUser.includes(getGroupId(pub.PK)));
    if (pubsWithMembership.length === 0) return undefined;
    return pubsWithMembership[0].photo;
};

// for new groups and new albums, photos may be provided by filename instead of id
const getPhotoByUrl = async (photoUrl, userId) => {
    let photoId;
    try {
        const photoKeys = await dynamoDb.query({
            KeyConditionExpression: '#url = :url and begins_with(PK, :p)',
            ExpressionAttributesNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': photoUrl, ':p': 'PO' }
        });
        const items = photoKeys.Items;
        if (!items || items.length === 0) return undefined;
        photoId = items[0].PK;
    } catch (_) {
        return undefined;
    };
    return await getPhotoByUser(photoId, userId);
};

export const getPhotoData = async (data, userId) => {
    const { photoId, photoUrl } = data;
    let photoData = {};
    if (photoId) {
        const photo = await getPhotoById(photoId, userId);
        if (photo) {
            photoData.photoId = photoId;
            photoData.photo = cleanRecord(photo);
        }
    } else if (photoUrl) {
        const photo = await getPhotoByUrl(photoUrl, userId);
        if (photo) {
            photoData.photoId = photo.PK.slice(2);
            photoData.photo = cleanRecord(photo);
        }
    }
    return photoData;
};