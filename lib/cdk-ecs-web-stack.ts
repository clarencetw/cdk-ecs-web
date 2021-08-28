import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

export class CdkEcsWebStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });
    const cluster = new ecs.Cluster(this, "EcsCluster", { vpc });

    const taskDefinition = new ecs.TaskDefinition(this, 'TaskDef', {
      memoryMiB: '512',
      cpu: '256',
      networkMode: ecs.NetworkMode.AWS_VPC,
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
    });

    taskDefinition.addContainer('nodejs-web-server', {
      image: ecs.ContainerImage.fromRegistry('clarencetw/nodejs-web-server'),
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'nodejs-web-server' }),
      environment: {
        NODE_ENV: "production",
      },
    });
    taskDefinition.addContainer('docker-nginx-multi-port', {
      image: ecs.ContainerImage.fromRegistry('clarencetw/docker-nginx-multi-port'),
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 80 }, { containerPort: 8000 }, { containerPort: 8001 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'docker-nginx-multi-port' }),
    });

    const fargateService = new ecs.FargateService(this, 'FargateService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
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
      targets: [fargateService.loadBalancerTarget({
        containerName: 'docker-nginx-multi-port',
        containerPort: 80
      })]
    });
    const listener8000 = lb.addListener("listener8000", { port: 8000, protocol: elbv2.ApplicationProtocol.HTTP });
    listener8000.addTargets('web_env', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [fargateService.loadBalancerTarget({
        containerName: 'docker-nginx-multi-port',
        containerPort: 8000
      })]
    });
    const listener8001 = lb.addListener("listener8001", { port: 8001, protocol: elbv2.ApplicationProtocol.HTTP });
    listener8001.addTargets('web_mysql', {
      port: 8001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [fargateService.loadBalancerTarget({
        containerName: 'docker-nginx-multi-port',
        containerPort: 8001
      })]
    });

    new cdk.CfnOutput(this, 'NGINX_Page', {
      value: `http://${lb.loadBalancerDnsName}`
    })
    new cdk.CfnOutput(this, 'MySQL_Page', {
      value: `http://${lb.loadBalancerDnsName}:8000`
    })
    new cdk.CfnOutput(this, 'ENV_Page', {
      value: `http://${lb.loadBalancerDnsName}:8001`
    })
  }
}
