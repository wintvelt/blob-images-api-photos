// API for webmaster to decide on appeal of photo flagging
import { handler, getUserFromEvent } from "blob-common/core/handler";
import { dbUpdateMulti, dynamoDb } from "blob-common/core/db";
import {
    dividerCell, emailBody, row, textCell,
    footerRow, greeting, headerRow, paragraph, photoRow, signatureCell, makeEmailSrc
} from 'blob-common/core/email';
import { ses } from "blob-common/core/ses";
import { diffDate, now } from "blob-common/core/date";

const DENY_DAYS = 7; // no of days after appeal denial, when photo will be deleted

const baseUrl = process.env.frontend || process.env.devFrontend || 'https://localhost:3000';
const dividerSrc = makeEmailSrc('public/img/invite_divider.png');

const approveText = ({ toName }) => {
    return `Hi ${toName}, jouw bezwaar over een melding van ongepaste inhoud is goedgekeurd.
Check de app om de status van meldingen over jouw foto's te bekijken`;
};
const denyText = ({ toName }) => {
    return `Hi ${toName}, HELAAS: jouw bezwaar over een melding van ongepaste inhoud is afgewezen.
Check de app om de status van meldingen over jouw foto's te bekijken`;
};

const approveBody = ({ toName, photoUrl }) => {
    return emailBody([
        headerRow(makeEmailSrc('public/img/logo_email_1.png'), baseUrl),
        (photoUrl) ? photoRow(makeEmailSrc(photoUrl, 600, 200), baseUrl) : '',
        row([
            textCell(greeting(`Hi ${toName},`)),
            textCell(paragraph(`Je bezwaar op de melding op 1 van je foto's is goedgekeurd. De foto blijft gewoon zichtbaar op clubalmanac`)),
            dividerCell(dividerSrc),
        ]),
        row([
            textCell(paragraph('We zien je graag terug op clubalmanac')),
            signatureCell(makeEmailSrc('public/img/signature_wouter.png'))
        ]),
        footerRow
    ]);
};
const denyBody = ({ toName, photoUrl }) => {
    return emailBody([
        headerRow(makeEmailSrc('public/img/logo_email_1.png'), baseUrl),
        (photoUrl) ? photoRow(makeEmailSrc(photoUrl, 600, 200), baseUrl) : '',
        row([
            textCell(greeting(`Hi ${toName},`)),
            textCell(paragraph(`HELAAS: Je bezwaar op de melding op 1 van je foto's is afgewezen. De foto zal binnenkort definitief van clubalmanac worden verwijderd`)),
            dividerCell(dividerSrc),
        ]),
        row([
            textCell(paragraph('We zien je evengoed graag terug op clubalmanac')),
            signatureCell(makeEmailSrc('public/img/signature_wouter.png'))
        ]),
        footerRow
    ]);
};

export const main = handler(async (event, context) => {
    const userId = getUserFromEvent(event);
    const isWebmaster = (userId === process.env.webmasterId);
    if (!isWebmaster) throw new Error('only webmaster can decide on appeal');

    const photoId = event.pathParameters.id;
    // get photo
    const photoResult = await dynamoDb.query({
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
            '#pk': 'PK',
        },
        ExpressionAttributeValues: {
            ":pk": `PO${photoId}`,
        },
    });
    if (!photoResult || !photoResult.Items || photoResult.Items.length === 0) throw new Error('photo not found');
    const photo = photoResult.Items[0];
    if (!photo.flaggedDate) throw new Error('photo not flagged');
    if (!photo.flaggedAppealDate) throw new Error('photo not appealed');

    const data = JSON.parse(event.body);
    if (!data.hasOwnProperty('decision')) throw new Error('no decision submitted');
    const { decision } = data;

    if (decision) { // appeal is approved
        await dbUpdateMulti(photo.PK, photo.SK, {
            flagged: '',
            flaggedDate: '',
            flaggedBy: '',
            flaggedAppealDate: '',
            flaggedDeleteDate: ''
        });
    } else {
        // need to get UPstats first because deletedFlagged may not exist
        const statsResult = await dynamoDb.get({
            Key: {
                PK: 'UPstats',
                SK: userId
            },
        });
        console.log(statsResult);
        const ownerStats = statsResult.Item;
        const previousDeletedFlagged = ownerStats.deletedFlagged || 0;
        // appeal denied: add denied flag to photo + increment denied stats
        await Promise.all([
            dynamoDb.update({
                Key: {
                    PK: 'UPstats',
                    SK: userId
                },
                UpdateExpression: 'SET #count = :val',
                ExpressionAttributeNames: { '#count': 'deletedFlagged' },
                ExpressionAttributeValues: { ':val': previousDeletedFlagged + 1 }
            }),
            dbUpdateMulti(photo.PK, photo.SK, {
                flaggedAppealDenyDate: now(),
                flaggedDeleteDate: diffDate(now(), DENY_DAYS)
            })
        ]);
    }
    // send email to photo owner
    const ownerEmail = photo.user.email;
    const toName = photo.user.name;
    const photoUrl = photo.url;
    const subject = (decision) ?
        'Je bezwaar over een melding voor ongepaste inhoud is goedgekeurd'
        : 'Je bezwaar over een melding voor ongepaste inhoud is afgewezen';
    await ses.sendEmail({
        toEmail: ownerEmail,
        fromEmail: 'clubalmanac <wouter@clubalmanac.com>',
        subject,
        data: (decision) ?
            approveBody({ toName, photoUrl })
            : denyBody({ toName, photoUrl }),
        textData: (decision) ?
            approveText({ toName })
            : denyText({ toName })
    });
});