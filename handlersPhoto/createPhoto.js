// invoked from S3 Lambda trigger
import { handler } from "blob-common/core/handler";
import { newPhotoId } from 'blob-common/core/ids';
import { dbUpdateMulti } from "blob-common/core/db";
import { dbItem, dbCreateItem } from 'blob-common/core/dbCreate';
import { cleanRecord } from 'blob-common/core/dbClean';
import { s3 } from "blob-common/core/s3";

import { getUserByCognitoId } from "../libs/dynamodb-lib-user";
import { getMemberRole } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const eventList = event.Records || [];
    console.log(eventList.map(item => item.s3?.object));
    const keyList = eventList.map(item => decodeURIComponent(item.s3.object.key));
    const keyListLength = keyList.length;

    let keyListByUser = {};
    // create sets per user
    for (let i = 0; i < keyListLength; i++) {
        const key = keyList[i];
        const cognitoId = key.split('/')[1];
        const userKeyList = keyListByUser[cognitoId];
        keyListByUser[cognitoId] = (userKeyList) ?
            [...userKeyList, key]
            : [key];
    }
    console.log(keyListByUser);
    // update per user
    const userList = Object.keys(keyListByUser);
    const userListLength = userList.length;
    for (let i = 0; i < userListLength; i++) {
        const cognitoId = userList[i];
        const userKeyList = keyListByUser[cognitoId];
        const user = await getUserByCognitoId(cognitoId);

        if (user) {
            const userKeyListLength = userKeyList.length;
            const userId = user.SK;
            let createPromises = [];
            for (let j = 0; j < userKeyListLength; j++) {
                const key = userKeyList[j];

                // add photo to user photos
                const photoId = newPhotoId();
                const photoItem = dbItem({
                    PK: 'PO' + photoId,
                    SK: user.SK,
                    url: key,
                    owner: user.SK,
                });
                createPromises.push(dbCreateItem(photoItem));

                const metadata = await s3.getMetadata({ Key: key });
                const customMeta = metadata.Metadata;
                if (customMeta) {
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