import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from "blob-common/core/dbClean";
import { getPhotoByUser } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    // get photo
    const photo = await getPhotoByUser(photoId, userId);

    return cleanRecord(photo);
});
