import { handler, getUserFromEvent } from "blob-common/core/handler";
import { dynamoDb, dbUpdateMulti } from "blob-common/core/db";
import { getPhotoById } from "../libs/dynamodb-lib-single";
import { dbCreateItem } from "blob-common/core/dbCreate";

export const main = handler(async (event, context) => {
    const photoId = event.pathParameters.id;
    const userId = getUserFromEvent(event);

    const photo = getPhotoById(photoId, userId);
    if (!photo) throw new Error('Not authorized to access photo');

    const userRatingKey = {
        PK: 'UF' + photoId,
        SK: userId,
    };

    // get rating (may not exist)
    const ratingParams = {
        Key: userRatingKey
    };
    const ratingResult = await dynamoDb.get(ratingParams);
    const ratingItem = ratingResult.Item;
    const oldUserRating = (ratingItem) ? parseInt(ratingItem.rating || 0) : 0;

    const data = JSON.parse(event.body);
    const userRatingUpdate = parseInt(data.ratingUpdate);

    // return empty if update is beyond -1, +1
    if (oldUserRating === userRatingUpdate) return '';

    const newUserRating = oldUserRating + userRatingUpdate;

    if (ratingItem) {
        // update rating of user
        await dbUpdateMulti(userRatingKey.PK, userRatingKey.SK, {
            rating: newUserRating,
            prevRating: oldUserRating
        });
    } else {
        // create a new rating record
        await dbCreateItem({
            PK: userRatingKey.PK,
            SK: userRatingKey.SK,
            rating: newUserRating,
            prevRating: oldUserRating
        });
    }

    return { status: 'ok' };
});
