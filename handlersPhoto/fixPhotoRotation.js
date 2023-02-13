// Edit a photo and save it on S3
// accessible only to admins of a group
// NB: file size may significantly increase - e.g 5.8mb to 8.3mb

import { getUserFromEvent, handler } from "blob-common/core/handler";
import { dbUpdateMulti } from "blob-common/core/db";
import { s3 } from 'blob-common/core/s3';
import { getPhotoById } from "../libs/dynamodb-lib-single";
import Jimp from "jimp";

const restampName = (f) => {
    const now = new Date().toISOString().split('.')[0].replace(/\s|:/g, "");
    return (f[15] === '-') ?
        `${now}-${f.slice(16)}`
        : (f[10] === 'T' && f[17] === '-') ?
            `${now}-${f.slice(18)}`
            : `${now}-${f}`;
};

export const main = handler(async (event, context) => {
    // for testing, allow secret userId in event
    const userId = event.secret?.userId || getUserFromEvent(event);
    const photoId = event.pathParameters.id;

    // read edits from request - body may be object
    const data = (typeof event.body === 'string') ? JSON.parse(event.body) : event.body;
    const { rotation, flipY } = data;

    console.log('get photo from DB');
    // retrieve photo from db - also return photo if owned by someone else, but user has access
    let photo = await getPhotoById(photoId, userId);
    if (!photo) throw new Error('photo not found in db');

    console.log('get file from s3');
    // get the file from S3
    const photoFile = await s3.get({
        Key: photo.url
    });
    if (!photoFile || !photoFile.Body) throw new Error('photo file not found');

    const oldFilename = photo.url.split('/').slice(-1)[0];
    // can be old = [20220128-...] or new = [2022-12-28T201013-...]
    const newFilename = restampName(oldFilename);
    const newPath = `protected/${userId.slice(1)}/${newFilename}`;

    // apply the edits on the image
    console.log('read image with jimp');
    const image = await Jimp.read(photoFile.Body);
    const mimeType = image.getMIME();
    console.log('edit image with jimp');
    const newPhotoBuffer = await image
        .flip(flipY, false)
        .rotate(rotation)
        .getBufferAsync(mimeType);

    let promises = [];
    // update the DB
    promises.push(dbUpdateMulti(photo.PK, photo.SK, {
        url: newPath
    }));

    // save the file on S3
    promises.push(s3.put({
        Body: newPhotoBuffer,
        Key: newPath,
        ContentType: mimeType,
        Metadata: {
            iscopy: "true"
        }
    }));

    // delete the old file
    promises.push(s3.delete({
        Key: photo.url
    }));

    console.log('update db, save new file, delete old file');
    try {
        await Promise.all(promises);
    } catch (error) {
        console.error(JSON.stringify(error));
        throw new Error('saving to S3 - or deleting from S3 - or db update - failed');
    }

    // return the new pathname
    return newPath;
});
