import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from "@aws-cdk/aws-ecs";
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as rds from '@aws-cdk/aws-rds';

export class CdkEcsWebStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });
    const cluster = new ecs.Cluster(this, "EcsCluster", { vpc });

    const rdsInstance = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_2_09_2 }),
      instanceProps: {
        instanceType: new ec2.InstanceType('t3.small'),
        vpc,
      },
      defaultDatabaseName: 'web_database',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.TaskDefinition(this, 'TaskDef', {
      memoryMiB: '512',
      cpu: '256',
      networkMode: ecs.NetworkMode.AWS_VPC,
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
    });

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('clarencetw/nodejs-web-server'),
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'nodejs-web-server' }),
      environment: {
        NODE_ENV: "production",
        PORT: "80",
        DB_DATABASE: 'web_database'
      },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(rdsInstance.secret!, "host"),
        DB_USERNAME: ecs.Secret.fromSecretsManager(
          rdsInstance.secret!,
          "username"
        ),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(
          rdsInstance.secret!,
          "password"
        ),
      },
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

    rdsInstance.connections.allowFrom(fargateService, rdsInstance.connections.defaultPort!, `allow ${fargateService.serviceName} to connect db`);

    const lb = new elbv2.ApplicationLoadBalancer(this, "LB", {
      vpc,
      internetFacing: true,
    });
    const listener = lb.addListener("Listener", { port: 80 });
    listener.addTargets('web', {
      port: 80,
      targets: [fargateService],
    });

    new cdk.CfnOutput(this, 'MySQL_Page', {
      value: `http://${lb.loadBalancerDnsName}/mysql`
    })
    new cdk.CfnOutput(this, 'ENV_Page', {
      value: `http://${lb.loadBalancerDnsName}/env`
    })
  }
}
