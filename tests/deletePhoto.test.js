import { eventContext } from './context';
import { main as deletePhoto } from '../handlersPhoto/deletePhoto';

const testPhotoId = 'PdKw6cBAVQsT4Lts';

test('delete a Photo', async () => {
    const event = eventContext({
        pathParameters: { id: testPhotoId }
    });
    const response = await deletePhoto(event);
    console.log(response);
    expect(response.statusCode).toEqual(200);
});