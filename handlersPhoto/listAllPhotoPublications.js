import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from 'blob-common/core/dbClean';
import { listPhotoPublications } from "../libs/dynamodb-lib-photo";
import { listPhotosByDate } from "../libs/dynamodb-query-lib";
import { dynamoDb } from "blob-common/core/db";

// return array with photos clustered per groupalbum (may include duplicates)
// [ { PK, SK, name, pubs: [ { ..photo.. }]}]

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const rawPhotos = await listPhotosByDate(userId);
    const photos = rawPhotos.filter(photo => !photo.flaggedDate);
    const pubs = await Promise.allSettled(photos
        .map(photo => listPhotoPublications(photo.PK.slice(2)))
    );
    let pubsDict = {}; // keep all photos in dict, per albumkey
    for (let i = 0; i < photos.length; i++) {
        const photo = cleanRecord(photos[i]);
        const photoPubs = pubs[i].value;
        const isUnpubbed = (photoPubs.length === 0);
        photoPubs.forEach(pub => {
            const groupAlbumKey = pub.PK;
            const oldPubs = pubsDict[groupAlbumKey] || [];
            pubsDict[groupAlbumKey] = [...oldPubs, photo];
        });

        if (isUnpubbed) {
            const oldPubs = pubsDict.unpubbed || [];
            pubsDict.unpubbed = [...oldPubs, photo];
        };
    };

    // retrieve album with keys and add to dict
    const albumKeys = Object.keys(pubsDict).filter(key => (key !== 'unpubbed'));
    const albumsData = await Promise.allSettled(albumKeys.map(key => {
        const groupId = key.split('#')[0].slice(2);
        const albumId = key.split('#')[1];
        const params = {
            Key: {
                PK: 'GA' + groupId,
                SK: albumId,
            }
        };
        return dynamoDb.get(params);
    }));
    const albums = albumsData.map(albumData => albumData.value?.Item);

    return [
        ...albumKeys.map((key, i) => {
            return { ...albums[i], data: pubsDict[key] };
        }),
        { name: 'unpubbed', SK: 'unpubbed', isUnpubbed: true, data: pubsDict.unpubbed }
    ];

});