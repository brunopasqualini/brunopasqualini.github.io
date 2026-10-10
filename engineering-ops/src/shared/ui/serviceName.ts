import { entryOf } from '@/engine/catalog';

const SHORT: Record<string, string> = {
  users: 'Traffic',
  alb: 'ALB',
  apigw: 'API Gateway',
  rds: 'RDS',
  ec2: 'EC2',
  ecs: 'ECS',
  eks: 'EKS',
  s3: 'S3',
  sqs: 'SQS',
  sns: 'SNS',
  waf: 'WAF',
  vpc: 'VPC',
  igw: 'IGW',
  nat: 'NAT',
  nacl: 'NACL',
  sg: 'Security group',
  iam: 'IAM',
  kms: 'KMS',
  route53: 'Route 53',
  cloudfront: 'CloudFront',
  cloudwatch: 'CloudWatch',
  cloudtrail: 'CloudTrail',
  elasticache: 'ElastiCache',
  dynamodb: 'DynamoDB',
  eventbridge: 'EventBridge',
  lambda: 'Lambda',
};

/** The service a node represents, in the short form architecture diagrams use under a label ("ALB", "RDS", "EC2"). */
export function serviceName(kind: string): string {
  return SHORT[kind] ?? entryOf(kind).name.replace(/^(Amazon|AWS) /, '');
}
