import { handler, getUserFromEvent } from "blob-common/core/handler";
import { dynamoDb, dbUpdateMulti } from "blob-common/core/db";
import { getPhotoById } from "../libs/dynamodb-lib-single";

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
        TableName: process.env.photoTable,
        Key: userRatingKey
    };
    const ratingResult = await dynamoDb.get(ratingParams);
    const ratingItem = ratingResult.Item;
    const oldUserRating = (ratingItem) ? ratingItem.rating : 0;

    const data = JSON.parse(event.body);
    const userRatingUpdate = parseInt(data.ratingUpdate);

    // if out of bounds return empty
    if (oldUserRating === userRatingUpdate) return '';

    const newUserRating = oldUserRating + userRatingUpdate;

    // save new rating of user
    await dbUpdateMulti(userRatingKey.PK, userRatingKey.SK, {
        rating: newUserRating,
        prevRating: oldUserRating
    });

    return { status: 'ok' };
});
