import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from "blob-common/core/dbClean";
import { getSignedUrlGet } from "blob-common/core/s3d";
import { getPhotoById } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    // get photo - also return photo if owned by someone else, but user has access
    let photo = await getPhotoById(photoId, userId);
    if (!photo) throw new Error('photo not found');

    // add signed s3 url
    const signedUrl = getSignedUrlGet({
        Key: photo.url
    });
    photo.signedUrl = signedUrl;

    return cleanRecord(photo);
});