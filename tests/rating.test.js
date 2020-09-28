import { eventContext } from './context';
import { main as updateRating } from '../handlersPhotoRating/updateRating';
import { main as getRating } from '../handlersPhotoRating/getRating';

const testPhotoId = 'PdKw6cBAVQsT4Lts';
const testUserId2 = 'U123test-user2';

// test('Get a (nonexistent) rating', async () => {
//     const event = eventContext({
//         pathParameters: { id: testPhotoId }
//     });
//     const response = await getRating(event);
//     expect(response.statusCode).toEqual(200);
//     const body = JSON.parse(response.body);
//     expect(body.rating).toEqual(0);
// });

test('Create a new rating', async () => {
    const event = eventContext({
        userId: testUserId2,
        pathParameters: { id: testPhotoId },
        body: { ratingUpdate: 1 }
    });
    const response = await updateRating(event);
    expect(response.statusCode).toEqual(200);
});