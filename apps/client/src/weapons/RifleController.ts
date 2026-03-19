import { MUZZLE_FLASH_LIFETIME_MS, RECOIL_RECOVER_RATE, SERVER_TICK_MS } from '@arena/shared';

export class RifleController {
  private nextAllowedShotAt = 0;
  private recoil = 0;

  tryFire(now: number, fireIntervalTicks: number): boolean {
    const cooldownMs = fireIntervalTicks * SERVER_TICK_MS;
    if (now < this.nextAllowedShotAt) {
      return false;
    }

    this.nextAllowedShotAt = now + cooldownMs;
    this.recoil = Math.min(0.12, this.recoil + 0.035);
    return true;
  }

  update(deltaSeconds: number): void {
    this.recoil = Math.max(0, this.recoil - RECOIL_RECOVER_RATE * deltaSeconds * 0.01);
  }

  getRecoil(): number {
    return this.recoil;
  }

  getMuzzleFlashUntil(now: number): number {
    return now + MUZZLE_FLASH_LIFETIME_MS;
  }
}
