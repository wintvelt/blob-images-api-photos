import { handler, getUserFromEvent } from "blob-common/core/handler";
import { cleanRecord } from 'blob-common/core/dbClean';
import { listPhotoPublications } from "../libs/dynamodb-lib-photo";
import { checkUser } from "../libs/dynamodb-lib-single";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const photoId = event.pathParameters.id;
    const publications = await listPhotoPublications(photoId);
    let filteredResult = [];
    const pubLength = publications.length;
    for (let i = 0; i < pubLength; i++) {
        const pub = publications[i];
        const groupId = pub.PK.split('#')[0].slice(2);
        const userIsInGroup = await checkUser(userId, groupId);
        if (userIsInGroup) filteredResult.push(cleanRecord(pub));
    }
    return filteredResult;
});