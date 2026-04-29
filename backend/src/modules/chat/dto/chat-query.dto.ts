import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class ChatQueryDto {
  @ApiProperty({ description: 'Question or message to send to the document chat agent' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Conversation session ID (UUID). Use the same ID across turns to maintain chat history.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({
    description: 'Specific document ID to focus on (optional — agent searches all indexed docs if omitted)',
  })
  @IsString()
  @IsOptional()
  docId?: string;
}
