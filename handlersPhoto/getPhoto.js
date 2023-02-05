import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from "blob-common/core/dbClean";
import { s3 } from "blob-common/core/s3";
import { getPhotoById } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    // get photo - also return photo if owned by someone else, but user has access
    let photo = await getPhotoById(photoId, userId);
    if (!photo) throw new Error('photo not found');
    if (photo.flaggedDate) throw new Error('photo flagged as inappropriate');

    // add signed s3 url
    const signedUrl = s3.getSignedUrlGet({
        Key: photo.url
    });
    photo.signedUrl = signedUrl;

    return cleanRecord(photo);
});