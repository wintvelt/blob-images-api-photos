// invoked from S3 Lambda trigger
import { handler } from "blob-common/core/handler";
import { newPhotoId } from 'blob-common/core/ids';
import { dbUpdateMulti } from "blob-common/core/db";
import { dbItem, dbCreateItem } from 'blob-common/core/dbCreate';
import { cleanRecord } from 'blob-common/core/dbClean';
import { s3 } from "blob-common/core/s3";

import { getUser } from "../libs/dynamodb-lib-user";
import { getMemberRole } from "../libs/dynamodb-lib-single";
import { getExifData } from "../libs/lib-geodata";

export const main = handler(async (event, context) => {
    const eventList = event.Records || [];
    console.log(eventList.map(item => item.s3?.object));
    const keyList = eventList.map(item => decodeURIComponent(item.s3.object.key));
    const keyListLength = keyList.length;

    let keyListByUser = {};
    // create sets per user
    for (let i = 0; i < keyListLength; i++) {
        const key = keyList[i];
        const userId = 'U' + key.split('/')[1];
        const userKeyList = keyListByUser[userId];
        keyListByUser[userId] = (userKeyList) ?
            [...userKeyList, key]
            : [key];
    }
    // update per user
    const userList = Object.keys(keyListByUser);
    const userListLength = userList.length;
    for (let i = 0; i < userListLength; i++) {
        const userId = userList[i];
        const userKeyList = keyListByUser[userId];
        const user = await getUser(userId);

        if (user) {
            const userKeyListLength = userKeyList.length;
            let createPromises = [];
            for (let j = 0; j < userKeyListLength; j++) {
                const key = userKeyList[j];
                // if file cannot be found (incl when filename contains spaces) then no addition to db
                const [metadata, file] = await Promise.all([
                    s3.getMetadata({ Key: key }),
                    s3.get({ Key: key })
                ]);
                const customMeta = metadata.Metadata;
                if (customMeta) {
                    // add photo to user photos, only if there are metadata
                    const photoId = newPhotoId();
                    const exifData = await getExifData(file);
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
                                const memberRole = await getMemberRole(userId, groupid);
                                const isGroupAdmin = (memberRole && memberRole === 'admin');
                                if (isGroupAdmin) {
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
                                const memberRole = await getMemberRole(userId, groupid);
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
                                const memberRole = await getMemberRole(userId, groupid);
                                const isGroupAdmin = (memberRole && memberRole === 'admin');
                                if (isGroupAdmin) {
                                    createPromises.push(dbUpdateMulti(`GA${groupid}`, albumid, {
                                        photoId,
                                        photo: cleanPhoto
                                    }));
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
                        default:
                            break;
                    }
                };
            };
            await Promise.all(createPromises);
        }
    }

    return 'ok';
});