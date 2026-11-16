import { SetMetadata } from '@nestjs/common';

export const Sectors = (...sectors: string[]) => SetMetadata('sectors', sectors);
