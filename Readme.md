# serverless-offline-sqs-external

- Fork on [serverless-offline-sqs](https://github.com/CoorpAcademy/serverless-plugins/tree/master/packages/serverless-offline-sqs) to support new version of serverless-offline and localstack in docker

This Serverless-offline plugin emulates AWS λ and SQS queue on your local machine. To do so, it listens SQS queue and invokes your handlers.

_Features_:

- [Serverless Webpack](https://github.com/serverless-heaven/serverless-webpack/) support.
- SQS configurations: batchsize.

## Installation

First, add `serverless-offline-sqs-external` to your project:

```sh
npm install serverless-offline-sqs-external
```

Then inside your project's `serverless.yml` file, add following entry to the plugins section before `serverless-offline` (and after `serverless-webpack` if presents): `serverless-offline-sqs-external`.

```yml
plugins:
  - serverless-webpack
  - serverless-offline-sqs-external
  - serverless-offline
```

## How it works?
This plugin listens to sqs event and invoke offline function to process event.

## Configure

### Functions

The configuration of function of the plugin follows the [serverless documentation](https://serverless.com/framework/docs/providers/aws/events/sqs/).

```yml
functions:
  mySQSHandler:
    handler: handler.compute
    events:
      - sqs: arn:aws:sqs:region:XXXXXX:MyFirstQueue
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:MySecondQueue
      - sqs:
          queueName: MyThirdQueue
          arn:
            Fn::GetAtt:
              - MyThirdQueue
              - Arn
      - sqs:
          arn:
            Fn::GetAtt:
              - MyFourthQueue
              - Arn
      - sqs:
          arn:
            Fn::GetAtt:
              - MyFifthQueue
              - Arn
resources:
  Resources:
    MyFourthQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: MyFourthQueue

    MyFifthQueue: # Support for Fifo queue creation starts from 3.1 only
      Type: AWS::SQS::Queue
      Properties:
        QueueName: MyFifthQueue.fifo
        FifoQueue: true
        ContentBasedDeduplication: true
```

### SQS

The configuration of [`aws.SQS`'s client](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#constructor-property) of the plugin is done by defining a `custom: serverless-offline-sqs-external` object in your `serverless.yml` with your specific configuration.

You could use [ElasticMQ](https://github.com/adamw/elasticmq) with the following configuration:

```yml
custom:
  serverless-offline-sqs-external:
    autoCreate: true                 # create queue if not exists
    apiVersion: '2012-11-05'
    host: localhost
    port: 9324
    https: false # default false
    region: eu-west-1
    accessKeyId: root
    secretAccessKey: root
    skipCacheInvalidation: false
```
