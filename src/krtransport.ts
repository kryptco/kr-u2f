import SQS from 'aws-sdk/clients/sqs';
import SNS from 'aws-sdk/clients/sns';
import { CreateQueueRequest, ReceiveMessageRequest, DeleteMessageBatchRequest, SendMessageRequest, ReceiveMessageResult } from 'aws-sdk/clients/sqs';
import { PublishInput } from 'aws-sdk/clients/sns';

import { Pairing } from "./krpairing";
import { stringify } from './krjson';

var config = {
    apiVersion: '2012-11-05',
    region: 'us-east-1',
    accessKeyId: 'AKIAJMZJ3X6MHMXRF7QQ',
    secretAccessKey: '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'
};

var sqs = new SQS(config);
var sns = new SNS(config);

const QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/911777333295/";

export async function createQueues(pairing: Pairing) {
    return Promise.all(
        [await pairing.sendQueueName(), await pairing.recvQueueName()].map(createQueue)
    )
}

function createQueue(name: string) {
    let request : CreateQueueRequest = {
        QueueName: name,
        Attributes: {
            'MessageRetentionPeriod': '172800',
        }
    };
    return sqs.createQueue(request).promise();
}

async function readQueue(pairing: Pairing) : Promise<ReceiveMessageResult> {
    let queueURL = QUEUE_URL + await pairing.recvQueueName();
    let request : ReceiveMessageRequest = {
        QueueUrl: queueURL,
        WaitTimeSeconds: 10,
        MaxNumberOfMessages: 10,
    };
    return sqs.receiveMessage(request).promise().then(v => {
        if (v.Messages.length > 0) {
            let request: DeleteMessageBatchRequest = {
                QueueUrl: queueURL,
                Entries: v.Messages.map(m => {
                    return {
                        Id: m.MessageId,
                        ReceiptHandle: m.ReceiptHandle,
                    };
                }),
            };
            sqs.deleteMessageBatch(request).send();
        }
        return v;
    }, e => {
        if (e.name == 'AWS.SimpleQueueService.NonExistentQueue') {
            console.info('Re-creating queues since non-existent')
            return createQueues(pairing);
        }
        return e;
    });
}

export async function receive(pairing: Pairing) {
    return readQueue(pairing);
}

async function sendSQS(pairing: Pairing, message: string) {
    let request : SendMessageRequest = {
        QueueUrl: QUEUE_URL + await pairing.sendQueueName(),
        MessageBody: message,
    };
    return sqs.sendMessage(request).send()
}

async function sendSNS(pairing: Pairing, message: string) {
    // apnsPayload, _ := json.Marshal(
	// 	map[string]interface{}{
	// 		"aps": map[string]interface{}{
	// 			"alert":             alertText,
	// 			"sound":             "",
	// 			"content-available": 1,
	// 			"mutable-content":   1,
	// 			"queue":             sqsQueueName,
	// 			"c":                 requestCiphertext,
	// 			"session_uuid":      sqsQueueName,
	// 		},
	// 	})
	// gcmPayload, _ := json.Marshal(
	// 	map[string]interface{}{
	// 		"data": map[string]interface{}{
	// 			"priority":         "high",
	// 			"time_to_live":     0,
	// 			"delay_while_idle": false,
	// 			"message":          requestCiphertext,
	// 			"queue":            sqsQueueName,
	// 		},
    // 	})
    if (!pairing.snsEndpointArn) {
        return;
    }
    let apnsPayload = await stringify({
        'aps': {
            'alert': 'Krypton Request',
            'sound': '',
            'content-available': 1,
            'mutable-content': 1,
            'queue': await pairing.sendQueueName(),
            'c': message,
            'session_uuid': await pairing.sendQueueName(),
        },
    });
    let params : PublishInput = {
        TargetArn: pairing.snsEndpointArn,
        MessageStructure: 'json',
        Message: await stringify({
            'APNS': apnsPayload,
            'APNS_SANDBOX': apnsPayload,
            'GCM': await stringify({
                'priority': 'high',
                'time_to_live': 0,
                'delay_while_idle': false,
                'message': message,
                'queue': await pairing.sendQueueName(),
            }),
        }),
    };
    sns.publish(params).send();
}

export function send(pairing: Pairing, message: string) {
    (async () => sendSNS(pairing, message))();
    (async () => sendSQS(pairing, message))();
}