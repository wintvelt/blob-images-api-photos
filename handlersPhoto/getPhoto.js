import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from "blob-common/core/dbClean";
import { getPhotoById } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    // get photo - also return photo if owned by someone else, but user has access
    const photo = await getPhotoById(photoId, userId);
    if (!photo) throw new Error('photo not found');

    return cleanRecord(photo);
});