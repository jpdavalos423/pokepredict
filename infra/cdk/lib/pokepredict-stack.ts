import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface PokepredictStackProps extends StackProps {
  project: string;
  stage: string;
}

export class PokepredictStack extends Stack {
  constructor(scope: Construct, id: string, props: PokepredictStackProps) {
    super(scope, id, props);

    Tags.of(this).add('project', props.project);
    Tags.of(this).add('stage', props.stage);
    Tags.of(this).add('managedBy', 'cdk');

    new CfnOutput(this, 'NamingPrefix', {
      value: `${props.project}-${props.stage}`,
      description: 'Naming prefix for future infrastructure resources.'
    });

    new CfnOutput(this, 'Phase0Notice', {
      value: 'Phase 0 scaffold only. No application resources are provisioned yet.',
      description: 'Tracks scaffold phase state.'
    });
  }
}
