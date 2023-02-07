// flag photo as inappropriate
import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from "blob-common/core/dbClean";
import { getPhotoById } from "../libs/dynamodb-lib-single";
import { dbUpdateMulti } from "blob-common/core/db";
import { now } from "blob-common/core/date";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    // get photo - also return photo if owned by someone else, but user has access
    let photo = await getPhotoById(photoId, userId);
    if (!photo) throw new Error('photo not found');
    if (photo.SK === userId) throw new Error('cannot flag your own photos');

    const flagParams = {
        flaggedDate: now(),
        flaggedBy: userId,
        flagged: 'flagged' // for flag-index
    };
    await dbUpdateMulti(photo.PK, photo.SK, flagParams);

    return cleanRecord({...photo, ...flagParams});
});