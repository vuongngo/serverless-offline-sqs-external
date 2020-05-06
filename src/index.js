import {
  Credentials, Endpoint, SQS, Lambda,
} from 'aws-sdk';
import { URL } from 'url';

import {
  isEmpty,
  omit,
  isPlainObject,
  isFalsey,
  printBlankLine,
  extractQueueNameFromARN,
} from './helpers';

class ServerlessOfflineSQSExternal {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.options = options;

    this.commands = {};

    this.hooks = {
      'before:offline:start': this.offlineStartInit.bind(this),
      'before:offline:start:init': this.offlineStartInit.bind(this),
      'before:offline:start:end': this.offlineStartEnd.bind(this),
    };

    this.streams = [];
  }

  getOfflineConfig() {
    const config = this.service.custom?.['serverless-offline'] || {};
    return {
      ...config,
      endpoint: config.endpoint || 'http://localhost:3002',
    };
  }

  getSqsConfig() {
    const config = this.service.custom?.['serverless-offline-sqs-external'] || {};
    let {
      endpoint, host = 'localhost', port = 4576, https = false,
    } = config;
    if (!endpoint) {
      endpoint = `${https ? 'https://' : 'http://'}${host}:${port}`;
    } else {
      const url = new URL(endpoint);
      host = url.hostname;
      port = url.port;
      https = url.protocol;
    }
    return {
      ...config,
      host,
      port,
      endpoint,
    };
  }

  getConfig() {
    return {
      ...this.options,
      ...this.service,
      ...this.service.provider,
    };
  }

  getClient() {
    const config = this.getSqsConfig();
    const sqsConfig = {
      endpoint: new Endpoint(config.endpoint),
      region: config.region,
      credentials: new Credentials({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }),
    };
    return new SQS(sqsConfig);
  }

  getProperties(queueEvent) {
    const getAtt = queueEvent?.arn?.['Fn::GetAtt'];
    if (getAtt) {
      const [resourceName] = getAtt;
      const properties = this.service?.resources?.Resources?.[resourceName]?.Properties;
      if (!properties) throw new Error(`No resource defined with name ${resourceName}`);
      return Object.entries(properties)
        .map(([key, value]) => {
          if (!isPlainObject(value)) return [key, value.toString()];
          if (
            Object.keys(value).some((k) => k === 'Ref' || k.startsWith('Fn::'))
            || Object.values(value).some(isPlainObject)
          ) {
            return this.serverless.cli.log(
              `WARN ignore property '${key}' in config as it is some cloudformation reference: ${JSON.stringify(
                value,
              )}`,
            );
          }
          return [key, JSON.stringify(value)];
        })
        .filter((val) => !isFalsey(val))
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    }
    return null;
  }

  getProperty(queueEvent, propertyName) {
    const properties = this.getProperties(queueEvent);
    return properties?.[propertyName] || null;
  }

  getQueueName(queueEvent) {
    if (typeof queueEvent === 'string') return extractQueueNameFromARN(queueEvent);
    if (typeof queueEvent.arn === 'string') return extractQueueNameFromARN(queueEvent.arn);
    if (typeof queueEvent.queueName === 'string') return queueEvent.queueName;

    const queueName = this.getProperty(queueEvent, 'QueueName');
    if (!queueName) {
      throw new Error(
        'QueueName not found. See https://github.com/CoorpAcademy/serverless-plugins/tree/master/packages/serverless-offline-sqs#functions',
      );
    }
    return queueName;
  }

  async eventHandler(queueEvent, functionName, messages) {
    if (!messages) return Promise.resolve();

    const streamName = this.getQueueName(queueEvent);
    this.serverless.cli.log(`${streamName} (λ: ${functionName})`);

    const config = this.getConfig();
    const awsRegion = config.region || 'us-east-1';
    const awsAccountId = config.accountId || '000000000000';
    const eventSourceARN = typeof queueEvent.arn === 'string'
      ? queueEvent.arn
      : `arn:aws:sqs:${awsRegion}:${awsAccountId}:${streamName}`;

    const func = this.service.getFunction(functionName);

    const { env } = process;
    const functionEnv = {
      ...({ AWS_REGION: awsRegion }),
      ...(env || {}),
      ...(this?.service?.provider?.environment || {}),
      ...(func?.environment || {}),
    };

    process.env = functionEnv;

    const event = {
      Records: messages.map(
        ({
          MessageId: messageId,
          ReceiptHandle: receiptHandle,
          Body: body,
          Attributes: attributes,
          MessageAttributes: messageAttributes,
          MD5OfBody: md5OfBody,
        }) => ({
          messageId,
          receiptHandle,
          body,
          attributes,
          messageAttributes,
          md5OfBody,
          eventSource: 'aws:sqs',
          eventSourceARN,
          awsRegion,
        }),
      ),
    };

    const offlineConfg = this.getOfflineConfig();
    const lambdaConfig = {
      apiVersion: '2015-03-31',
      endpoint: new Endpoint(offlineConfg.endpoint),
      region: awsRegion,
      credentials: new Credentials({
        accessKeyId: 'foo',
        secretAccessKey: 'bar',
      }),
    };
    const lambda = new Lambda(lambdaConfig);

    const params = {
      FunctionName: `${this.service.service}-${this.service.provider.stage}-${functionName}`,
      InvocationType: 'Event',
      Payload: JSON.stringify(event),
    };

    await lambda.invoke(params).promise();

    process.env = env;
    return null;
  }

  async createQueueReadable(functionName, queueEvent) {
    const client = this.getClient();
    const QueueName = this.getQueueName(queueEvent);
    this.serverless.cli.log(`Queue Name: ${QueueName}`);

    const sqsConfig = this.getSqsConfig();
    if (sqsConfig.autoCreate) {
      const properties = this.getProperties(queueEvent);
      const params = {
        QueueName,
        Attributes: omit(['QueueName'], properties),
      };
      await client.createQueue(params).promise();
    }

    let { QueueUrl } = await client.getQueueUrl({ QueueName }).promise();
    QueueUrl = QueueUrl.replace('localhost', sqsConfig.host);

    const next = async () => {
      const { Messages } = await client.receiveMessage(
        {
          QueueUrl,
          MaxNumberOfMessages: queueEvent.batchSize,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
          WaitTimeSeconds: 20,
        },
      ).promise();

      if (Messages) {
        try {
          await this.eventHandler(queueEvent, functionName, Messages);

          await client.deleteMessageBatch(
            {
              Entries: (Messages || []).map(({ MessageId: Id, ReceiptHandle }) => ({
                Id,
                ReceiptHandle,
              })),
              QueueUrl,
            },
          ).promise();
        } catch (err) {
          this.serverless.cli.log(err.stack);
        }
      }

      next();
    };

    next();
  }

  offlineStartInit() {
    this.serverless.cli.log('Starting Offline SQS.');

    Object.entries(this.service.functions).map(([functionName, _function]) => {
      const queues = (_function?.events || [])
        .filter((event) => event?.sqs)
        .map((event) => event.sqs);

      if (!isEmpty(queues)) {
        printBlankLine();
        this.serverless.cli.log(`SQS for ${functionName}:`);
      }

      queues.forEach((queueEvent) => {
        this.createQueueReadable(functionName, queueEvent);
      });

      if (!isEmpty(queues)) {
        printBlankLine();
      }
      return null;
    });
  }

  offlineStartEnd() {
    this.serverless.cli.log('offline-start-end');
  }
}

module.exports = ServerlessOfflineSQSExternal;
