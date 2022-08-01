import { handler } from "blob-common/core/handler";
import { s3 } from "blob-common/core/s3";
import AWS from "aws-sdk";
import { dynamoDb } from "blob-common/core/db";

const lambdaFunc = new AWS.Lambda();
const lambdaParams = {
    FunctionName: process.env.createPhotoArn,
    InvocationType: 'RequestResponse',
    LogType: 'Tail'
};
const lambda = {
    invoke: (event) => lambdaFunc.invoke({ ...lambdaParams, Payload: JSON.stringify(event) }).promise()
};

export const main = handler(async (event, context) => {
    const { userId, dateTimeFrom } = event;
    if (!userId || !dateTimeFrom) return "userId or dateTimeFrom missing from event body";
    const fileList = await s3.list({
        Prefix: `protected/${userId}/`
    });
    const { Contents } = fileList;
    if (!Contents || Contents.length === 0) return "no Contents found or empty Contents";
    console.log(`user has ${Contents.length} photos in S3`);

    const keysFromS3 = Contents
        .filter(item => {
            return (item.LastModified.toISOString() > dateTimeFrom);
        })
        .map(item => item.Key);

    if (keysFromS3.length === 0) return `no keys to process for user ${userId}`;
    console.log(`${keysFromS3.length} photos on S3 after ${dateTimeFrom}`);

    // Find photoUrls in DB
    const urlQueries = keysFromS3.map(key => dynamoDb.query({
        IndexName: process.env.urlIndex,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
            '#pk': 'url',
        },
        ExpressionAttributeValues: {
            ":pk": key,
        },
    }));
    const urlsResult = await Promise.all(urlQueries);
    const urlsNotInDB = urlsResult.map(res => (res.Count === 0));

    // Filter out any photo's already in DB
    const keysToProcess = keysFromS3.filter((key, i) => (urlsNotInDB[i]));
    console.log(`${keysToProcess.length} photos in S3 not yet in DB`);
    console.log(keysToProcess);

    const promises = keysToProcess.map(key => lambda.invoke({ Records: [{ s3: { object: { key } } }] }));

    const result = await Promise.all(promises);
    const responses = result.map(it => JSON.parse(it.Payload));
    const okCount = responses.filter(it => (it.statusCode === 200)).length;
    console.log(responses);
    return `${okCount} of ${promises.length} processed succesfully`;
});