// Checks for all users if their photo count is still OK
// event may contain userId - to only check for 1 user

import { handler } from "blob-common/core/handler";
import { s3 } from "blob-common/core/s3";
// import AWS from "aws-sdk";
import { dynamoDb } from "blob-common/core/db";

// const lambdaFunc = new AWS.Lambda();
// const lambdaParams = {
//     FunctionName: process.env.createPhotoArn,
//     InvocationType: 'RequestResponse',
//     LogType: 'Tail'
// };
// const lambda = {
//     invoke: (event) => lambdaFunc.invoke({ ...lambdaParams, Payload: JSON.stringify(event) }).promise()
// };

// to turn list of keys into object with stats
const keyReducer = (outObj, key, i, inArr) => {
    const userId = key.split('/')[1];
    const userItem = outObj[userId] || { s3: 0 };
    const newUserItem = { s3: userItem.s3 + 1 };
    return { ...outObj, [userId]: newUserItem };
}

export const main = handler(async (event, context) => {
    // list files from protected folder on S3
    const { userId } = event;
    const preFix = (userId) ? `protected/${userId}/` : `protected/`;
    let keysFromS3 = [];
    let continuationToken = '';
    do {
        const fileList = await s3.list({
            Prefix: preFix,
            ContinuationToken: continuationToken
        });
        const contents = fileList.Contents || [];
        // collect keys from output
        const newKeys = contents.map(item => item.Key);
        keysFromS3 = [...keysFromS3, ...newKeys];
        // continue loop if there is more to fetch
        continuationToken = fileList.NextContinuationToken || '';
    } while (continuationToken);

    // count s3 photos per user - into mutable object
    let countObj = keysFromS3.reduce(keyReducer, {});

    // retrieve stats for all users
    const dbQuery = await dynamoDb.query({
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
            '#pk': 'PK',
        },
        ExpressionAttributeValues: {
            ":pk": 'UPstats',
        }
    });
    const dbStats = dbQuery.Items || [];
    console.log(dbStats);

    console.table(countObj);

    // compare and print to log

    // Find photoUrls in DB

    return `OK`;
});