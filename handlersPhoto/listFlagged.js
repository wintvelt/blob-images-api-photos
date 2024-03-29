// Returns personal photos flagged by others
import { handler, getUserFromEvent } from "blob-common/core/handler";
import { listPhotosByDate } from "../libs/dynamodb-query-lib";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photos = await listPhotosByDate(userId);
    return photos
        .filter(photo => !!photo.flaggedDate);
});