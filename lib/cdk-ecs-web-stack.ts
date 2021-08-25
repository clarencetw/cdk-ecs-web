import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

export class CdkEcsWebStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });
    const cluster = new ecs.Cluster(this, "EcsCluster", { vpc });

    const spotAutoScalingGroup = new autoscaling.AutoScalingGroup(this, 'spotASG', {
      vpc,
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 0,
      maxCapacity: 6,
      spotPrice: '0.0416'
    });
    const spotCapacityProvider = new ecs.AsgCapacityProvider(this, 'spotAsgCapacityProvider', {
      autoScalingGroup: spotAutoScalingGroup,
      spotInstanceDraining: true,
    });
    cluster.addAsgCapacityProvider(spotCapacityProvider);

    const taskDefinition = new ecs.TaskDefinition(this, 'TaskDef', {
      memoryMiB: '512',
      cpu: '256',
      networkMode: ecs.NetworkMode.AWS_VPC,
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
    });

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'web' })
    });

    const ec2Service = new ecs.Ec2Service(this, 'EC2Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [
        {
          capacityProvider: spotCapacityProvider.capacityProviderName,
          weight: 1,
        }
      ],
    });
    const fargateService = new ecs.FargateService(this, 'FargateService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
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
      targets: [ec2Service, fargateService],
    });

    new cdk.CfnOutput(this, 'WebURL', {
      value: `http://${lb.loadBalancerDnsName}/`
    })
  }
}
