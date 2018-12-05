import SNS from 'aws-sdk/clients/sns';
import { PublishInput } from 'aws-sdk/clients/sns';
import SQS from 'aws-sdk/clients/sqs';
import {
            CreateQueueRequest,
            DeleteMessageBatchRequest,
            ReceiveMessageRequest,
            ReceiveMessageResult,
            SendMessageRequest,
        } from 'aws-sdk/clients/sqs';

import { stringify } from './krjson';
import { Pairing } from './krpairing';

const config = {
    accessKeyId: 'AKIAJMZJ3X6MHMXRF7QQ',
    apiVersion: '2012-11-05',
    region: 'us-east-1',
    secretAccessKey: '0hincCnlm2XvpdpSD+LBs6NSwfF0250pEnEyYJ49',
};

const sqs = new SQS(config);
const sns = new SNS(config);

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/911777333295/';

export async function createQueues(pairing: Pairing) {
    return Promise.all(
        [await pairing.sendQueueName(), await pairing.recvQueueName()].map(createQueue),
    );
}

function createQueue(name: string) {
    const request: CreateQueueRequest = {
        Attributes: {
            MessageRetentionPeriod: '172800',
        },
        QueueName: name,
    };
    return sqs.createQueue(request).promise();
}

async function readQueue(pairing: Pairing): Promise<ReceiveMessageResult> {
    const queueURL = QUEUE_URL + await pairing.recvQueueName();
    const request: ReceiveMessageRequest = {
        MaxNumberOfMessages: 10,
        QueueUrl: queueURL,
        WaitTimeSeconds: 10,
    };
    return sqs.receiveMessage(request).promise().then((v) => {
        if (v.Messages.length > 0) {
            const request: DeleteMessageBatchRequest = {
                Entries: v.Messages.map((m) => {
                    return {
                        Id: m.MessageId,
                        ReceiptHandle: m.ReceiptHandle,
                    };
                }),
                QueueUrl: queueURL,
            };
            sqs.deleteMessageBatch(request).send();
        }
        return v;
    }, (e) => {
        if (e.name === 'AWS.SimpleQueueService.NonExistentQueue') {
            console.warn('Re-creating queues since non-existent');
            return createQueues(pairing);
        }
        return e;
    });
}

export async function receive(pairing: Pairing) {
    return readQueue(pairing);
}

async function sendSQS(pairing: Pairing, message: string) {
    const request: SendMessageRequest = {
        MessageBody: message,
        QueueUrl: QUEUE_URL + await pairing.sendQueueName(),
    };
    return sqs.sendMessage(request).send();
}

async function sendSNS(pairing: Pairing, message: string) {
    // apnsPayload, _ := json.Marshal(
    //     map[string]interface{}{
    //         "aps": map[string]interface{}{
    //             "alert":             alertText,
    //             "sound":             "",
    //             "content-available": 1,
    //             "mutable-content":   1,
    //             "queue":             sqsQueueName,
    //             "c":                 requestCiphertext,
    //             "session_uuid":      sqsQueueName,
    //         },
    //     })
    // gcmPayload, _ := json.Marshal(
    //     map[string]interface{}{
    //         "priority":         "high",
    //         "time_to_live":     0,
    //         "delay_while_idle": false,
    //         "data": map[string]interface{}{
    //             "message":          requestCiphertext,
    //             "queue":            sqsQueueName,
    //         },
    //     })
    if (!pairing.snsEndpointArn) {
        return;
    }
    const apnsPayload = await stringify({
        aps: {
            'alert': 'Krypton Request',
            'c': message,
            'content-available': 1,
            'mutable-content': 1,
            'queue': await pairing.sendQueueName(),
            'session_uuid': await pairing.sendQueueName(),
            'sound': '',
        },
    });
    const params: PublishInput = {
        Message: await stringify({
            APNS: apnsPayload,
            APNS_SANDBOX: apnsPayload,
            GCM: await stringify({
                data: {
                    message,
                    queue: await pairing.sendQueueName(),
                },
                delay_while_idle: false,
                priority: 'high',
                time_to_live: 0,
            }),
        }),
        MessageStructure: 'json',
        TargetArn: pairing.snsEndpointArn,
    };
    sns.publish(params).send();
}

export function send(pairing: Pairing, message: string) {
    (async () => sendSNS(pairing, message))();
    (async () => sendSQS(pairing, message))();
}
