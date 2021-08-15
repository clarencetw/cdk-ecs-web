import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as autoscaling from "@aws-cdk/aws-autoscaling";

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
  }
}
