// invoked from S3 Lambda trigger
import { handler } from "blob-common/core/handler";
import { newPhotoId } from 'blob-common/core/ids';
import { dbUpdateMulti } from "blob-common/core/db";
import { dbItem, dbCreateItem } from 'blob-common/core/dbCreate';
import { cleanRecord } from 'blob-common/core/dbClean';
import { s3 } from "blob-common/core/s3";

import { getUser, getUserByCognitoId } from "../libs/dynamodb-lib-user";
import { getMemberRole } from "../libs/dynamodb-lib-single";
import { fetchGeoCode, getExifData } from "../libs/lib-geodata";

const s3KeyFromUrl = (key) => (
    key.split('/').slice(0, 2).join('/') +
    '/' + decodeURIComponent(key.split('/')[2])
);

export const main = handler(async (event, context) => {
    const eventList = event.Records || [];
    const keyList = eventList.map(item => item.s3.object.key);
    const keyListLength = keyList.length;

    let keyListByUser = {};
    // create sets per user
    for (let i = 0; i < keyListLength; i++) {
        const key = keyList[i];
        const keySegments = key.split('/');
        if (keySegments.length < 3) continue; // not the file we're looking for
        const folder = keySegments[0];
        if (!folder === 'protected' || !folder === 'private') continue; // only care for user items
        const userId = 'U' + keySegments[1];
        const userKeyList = keyListByUser[userId];
        const cleanKey = s3KeyFromUrl(key);
        keyListByUser[userId] = (userKeyList) ?
            [...userKeyList, cleanKey]
            : [cleanKey];
    }
    console.log("made keyListByUser");
    console.log(keyListByUser);
    // update per user
    const userList = Object.keys(keyListByUser);
    const userListLength = userList.length;
    for (let i = 0; i < userListLength; i++) {
        const userId = userList[i];
        const userKeyList = keyListByUser[userId];
        const userIsCognito = userId.includes('eu-central-1:');
        let user;
        try {
            user = (userIsCognito) ?
                await getUserByCognitoId(userId.slice(1))
                : await getUser(userId);
            console.log("got user");
        } catch (error) {
            console.log("getting user failed");
            throw new Error(error);
        }

        if (user) {
            const userKeyListLength = userKeyList.length;
            let createPromises = [];
            for (let j = 0; j < userKeyListLength; j++) {
                const key = userKeyList[j];
                // if file cannot be found (incl when filename contains spaces) then no addition to db
                let file;
                let metadata;
                try {
                    file = await s3.get({ Key: key }); // event stream provides encoded keys
                    console.log("got file");
                } catch (error) {
                    console.log("failed to get file");
                    throw new Error(error);
                };
                try {
                    metadata = await s3.getMetadata({ Key: key }); // event stream provides encoded keys
                    console.log("got metadata");
                } catch (error) {
                    console.log("failed to get metadata");
                    throw new Error(error);
                }
                const customMeta = metadata.Metadata;
                if (!customMeta || !customMeta.iscopy) {
                    // if this is not a migration

                    // add photo to user photos,
                    const photoId = newPhotoId();
                    let exifData;
                    console.log("getting exif data");
                    try {
                        if (customMeta?.datetimeoriginal) {
                            exifData = { exifDate: customMeta.datetimeoriginal.slice(0, 10).replace(/:/g, '-') };
                            if (customMeta.gpslatitude) {
                                exifData.exifLat = parseFloat(customMeta.gpslatitude);
                                if (customMeta.gpslongitude) exifData.exifLon = parseFloat(customMeta.gpslongitude);
                                const exifAddress = await fetchGeoCode(exifData.exifLat, exifData.exifLon);
                                if (exifAddress) exifData.exifAddress = exifAddress;
                            }
                            console.log("got exif data from file");
                        } else {
                            exifData = await getExifData(file);
                            console.log("got exif data from image");
                        }
                    } catch (error) {
                        console.log("getting exif data failed");
                    }
                    const photoItem = dbItem({
                        PK: 'PO' + photoId,
                        SK: user.SK,
                        url: key,
                        user: cleanRecord(user),
                        ...exifData,
                    });
                    createPromises.push(dbCreateItem(photoItem));

                    const cleanPhoto = cleanRecord(photoItem);
                    const { action, groupid, albumid } = customMeta;
                    switch (action) {
                        case 'albumphoto': {
                            if (groupid && albumid) {
                                let memberRole;
                                try {
                                    memberRole = await getMemberRole(userId, groupid);
                                    console.log('got memberRole');
                                } catch (error) {
                                    console.log('get memberRole failed');
                                    throw new Error(error);
                                }
                                // guests also allowed to add photos to albums
                                const isMember = !!memberRole;
                                if (isMember) {
                                    const AlbumPhotoItem = {
                                        PK: `GP${groupid}#${albumid}`,
                                        SK: photoId,
                                        photo: cleanPhoto,
                                    };
                                    createPromises.push(dbCreateItem(AlbumPhotoItem));
                                }
                            }
                            break;
                        }
                        case 'groupcover': {
                            if (groupid) {
                                let memberRole;
                                try {
                                    memberRole = await getMemberRole(userId, groupid);
                                    console.log('got memberRole');
                                } catch (error) {
                                    console.log('get memberRole failed');
                                    throw new Error(error);
                                }
                                const isGroupAdmin = (memberRole && memberRole === 'admin');
                                if (isGroupAdmin) {
                                    createPromises.push(dbUpdateMulti('GBbase', groupid, {
                                        photoId,
                                        photo: cleanPhoto
                                    }));
                                }
                            }
                            break;
                        }
                        case 'albumcover': {
                            if (groupid && albumid) {
                                let memberRole;
                                try {
                                    memberRole = await getMemberRole(userId, groupid);
                                    console.log('got memberRole');
                                } catch (error) {
                                    console.log('get memberRole failed');
                                    throw new Error(error);
                                }
                                const isGroupAdmin = (memberRole && memberRole === 'admin');
                                if (isGroupAdmin) {
                                    createPromises.push(dbUpdateMulti(`GA${groupid}`, albumid, {
                                        photoId,
                                        photo: cleanPhoto
                                    }));
                                    const AlbumPhotoItem = {
                                        PK: `GP${groupid}#${albumid}`,
                                        SK: photoId,
                                        photo: cleanPhoto,
                                    };
                                    createPromises.push(dbCreateItem(AlbumPhotoItem));
                                }
                            }
                            break;
                        }
                        case 'usercover': {
                            createPromises.push(dbUpdateMulti('UBbase', userId, {
                                photoId,
                                photoUrl: cleanPhoto.url
                            }));
                            break;
                        }
                        default: {
                            console.log(`ignored action "${action}"`);
                            break;
                        }
                    }
                } else {
                    console.log(`upload ${key} ignored`);
                };
            };
            console.log(`going to do ${createPromises.length} promises to DB`);
            try {
                await Promise.all(createPromises);
                console.log(`completed ${createPromises.length} promises to DB`);
            } catch (error) {
                throw new Error(error);
            }
        }
    }

    return 'ok';
});