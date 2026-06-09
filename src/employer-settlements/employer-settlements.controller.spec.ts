import { Test, TestingModule } from '@nestjs/testing';
import { EmployerSettlementsController } from './employer-settlements.controller';

describe('EmployerSettlementsController', () => {
  let controller: EmployerSettlementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployerSettlementsController],
    }).compile();

    controller = module.get<EmployerSettlementsController>(EmployerSettlementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
