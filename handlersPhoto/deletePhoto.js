import { getUserFromEvent, handler } from "blob-common/core/handler";
import { dynamoDb } from "blob-common/core/db";
import { s3 } from 'blob-common/core/s3';

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);

    const photoParams = {
        Key: {
            PK: 'PO' + event.pathParameters.id,
            SK: userId,
        },
        ReturnValues: "ALL_OLD"
    };

    const result = await dynamoDb.delete(photoParams);
    const oldPhoto = result.Attributes;
    if (!oldPhoto) {
        throw new Error("Photo not found.");
    };

    const photoUrl = oldPhoto.url;
    try {
        await s3.delete({
            Key: photoUrl
        });
    } catch (error) {
        console.log(error);
        throw new Error('Photo deletion failed');
    }

    return 'ok';
});
