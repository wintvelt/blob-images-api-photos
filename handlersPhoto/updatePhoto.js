import { getUserFromEvent, handler } from "blob-common/core/handler";
import { dbUpdateMulti } from "blob-common/core/db";

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const data = JSON.parse(event.body);
    if (!userId || !data || !data.exifLat) throw new Error('invalid request');

    let photoUpdateKV = {};
    photoUpdateKV.exifLat = data.exifLat;
    if (data.exifLon) photoUpdateKV.exifLon = data.exifLon;
    if (data.exifAddress) photoUpdateKV.exifAddress = data.exifAddress;

    const result = await dbUpdateMulti(
        'PO' + event.pathParameters.id, userId,
        photoUpdateKV
    );
    const oldPhoto = result.Attributes;
    if (!oldPhoto) {
        throw new Error("Photo not found.");
    };

    return 'ok';
});
