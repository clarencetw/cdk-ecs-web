import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

export class CdkEcsWebStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });
    const cluster = new ecs.Cluster(this, "EcsCluster", { vpc });

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef');

    fargateTaskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'web' })
    });

    const service = new ecs.FargateService(this, 'FargateService', {
      cluster,
      taskDefinition: fargateTaskDefinition,
      desiredCount: 3,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 2,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        }
      ],
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "LB", {
      vpc,
      internetFacing: true,
    });
    const listener = lb.addListener("Listener", { port: 80 });
    listener.addTargets('web', {
      port: 80,
      targets: [service],
    });

    new cdk.CfnOutput(this, 'WebURL', {
      value: `http://${lb.loadBalancerDnsName}/`
    })
  }
}
