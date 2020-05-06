import {
  Credentials, Endpoint, SQS, Lambda,
} from 'aws-sdk';

export const handler = async (event, context) => {
  const sqsConfig = {
    endpoint: 'http://localstack:4576',
    region: 'us-east-1',
    credentials: new Credentials({
      accessKeyId: 'root',
      secretAccessKey: 'root',
    }),
  };
  const sqs = new SQS(sqsConfig);
  const params = {
    MessageBody: 'test',
    QueueUrl: 'http://localstack:4576/queue/test-sqs'
  };
  const sent = await sqs.sendMessage(params).promise();
  return sent;
};
