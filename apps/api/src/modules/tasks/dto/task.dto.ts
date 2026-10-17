import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../inventory/dto/inventory-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTaskDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El título de la tarea es obligatorio' })
  @MaxLength(120)
  title!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  // Deadline with explicit time zone, e.g. 2026-10-20T18:00:00-05:00. A
  // value without zone would be read in the server's zone, so it is refused.
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, {
    message: 'dueAt debe incluir hora y zona horaria (por ejemplo -05:00)',
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'dueAt debe ser una fecha y hora ISO 8601 con zona horaria' },
  )
  dueAt!: string;

  // Omitted: the task is for the user creating it. Another user: ADMIN only.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assigneeId?: string;
}

export const TASK_STATUSES = ['pending', 'completed', 'incomplete'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export class ListTasksQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TASK_STATUSES, { message: 'status debe ser pending, completed o incomplete' })
  status?: TaskStatus;

  // ADMIN: filter by employee (omitted = everyone). Others: only themselves.
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assigneeId?: string;
}

export class TaskSummaryQueryDto {
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assigneeId?: string;
}
