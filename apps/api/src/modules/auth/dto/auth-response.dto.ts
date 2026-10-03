import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto';

/**
 * Returned by register, login and refresh. The refresh token is NOT in the body:
 * it travels only in an HttpOnly cookie scoped to /api/v1/auth.
 */
export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT (keep it in memory only).' })
  access_token!: string;

  @ApiProperty({ example: 'Bearer' })
  token_type!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds.' })
  expires_in!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
