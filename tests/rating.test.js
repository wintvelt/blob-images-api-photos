import dynamoDb from '../../libs/dynamodb-lib';
import { eventContext, testUserId, testUser, testPhotoId, sleep, setUp, cleanUp } from '../context';
import { main as updateRating } from '../../handlersPhotoRating/updateRating';
import { main as getRating } from '../../handlersPhotoRating/getRating';
import { getPhotoById } from '../../libs/dynamodb-lib-single';

const TIMEOUT = 2000;

test('Get a (nonexistent) rating', async () => {
    const event = eventContext({
        pathParameters: { id: testPhotoId }
    });
    const response = await getRating(event);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.rating).toEqual(0);
});

test('Create a new rating', async () => {
    const event = eventContext({
        pathParameters: { id: testPhotoId },
        body: { ratingUpdate: 1 }
    });
    const response = await updateRating(event);
    expect(response.statusCode).toEqual(200);
    await sleep(TIMEOUT);

    //check if photo is also updated
    const photo = await getPhotoById(testPhotoId, testUserId);
    expect(photo.rating).toEqual(1);
}, (TIMEOUT) + 2000);