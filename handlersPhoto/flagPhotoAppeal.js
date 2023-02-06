// appeal to flagging of photo by others
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
    if (photo.SK !== userId) throw new Error('photo is not yours');
    if (!photo.flaggedDate) throw new Error('photo not flagged');

    const appealParams = {
        flaggedAppealDate: now()
    };
    await dbUpdateMulti(photo.PK, photo.SK, appealParams);

    return cleanRecord({ ...photo, ...appealParams });
});