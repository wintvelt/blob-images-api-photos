import { dynamoDb } from 'blob-common/core/db';
import { dbCreateItem } from 'blob-common/core/dbCreate';

const testUserCognitoId = 'eu-central:123456';
export const testUserId = 'U' + '123normal-test-id123';
export const testGroupId = 'GsaQFBAI7XisyPzj'; // from test dynamoDb

export const testUser = {
    name: 'Wouter',
    email: 'wintvelt@xs4all.nl',
};

export const setUp = async (recordList) => {
    let promises = [];
    for (let i = 0; i < recordList.length; i++) {
        const rec = recordList[i];
        promises.push(dbCreateItem(rec));
    }
    return Promise.all(promises);
};

export const cleanUp = async (recordList) => {
    let promises = [];
    for (let i = 0; i < recordList.length; i++) {
        const rec = recordList[i];
        promises.push(dynamoDb.delete({
            Key: {
                PK: rec.PK,
                SK: rec.SK,
            }
        }));
    }
    return Promise.all(promises);
};

export const eventContext = (event) => {
    const { body, pathParameters, userId = testUserId, cognitoUserId = testUserCognitoId } = event || {};
    return {
        "requestContext": {
            "identity": {
                "cognitoIdentityId": cognitoUserId,
                "cognitoAuthenticationProvider": `cognito-idp....:${userId.slice(1)}`
            }
        },
        body: (body) ? JSON.stringify(body) : '',
        pathParameters
    };
};

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};