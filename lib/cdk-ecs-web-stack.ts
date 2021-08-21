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

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 0,
      maxCapacity: 6,
    });
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'web' })
    });

    const service = new ecs.Ec2Service(this, 'EC2Service', {
      cluster,
      taskDefinition,
      desiredCount: 3,
      capacityProviderStrategies: [
        {
          capacityProvider: spotCapacityProvider.capacityProviderName,
          weight: 2,
        },
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
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
    listener.connections.allowTo(spotAutoScalingGroup, ec2.Port.tcpRange(32768, 65535))
    listener.connections.allowTo(autoScalingGroup, ec2.Port.tcpRange(32768, 65535))

    new cdk.CfnOutput(this, 'WebURL', {
      value: `http://${lb.loadBalancerDnsName}/`
    })
  }
}
