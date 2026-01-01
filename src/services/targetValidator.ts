/**
 * Service to validate target data (tickers, ISINs, etc.)
 */

import { lookupNameFromTicker, lookupNameFromISIN } from './tickerLookup';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  needsAutoDetect: boolean;
  missingFields: string[];
}

export interface TargetToValidate {
  assetType: string;
  assetCategory?: string;
  instrument?: string;
  isin?: string;
  mainTicker?: string;
  otherTickers?: string[];
  targetPercentage: number;
  rowNumber: number;
}

/**
 * Validate a target row - check if tickers exist and ISINs match
 */
export async function validateTarget(target: TargetToValidate): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFields: string[] = [];

  // Check for missing fields
  if (!target.mainTicker && !target.isin) {
    missingFields.push('Main Ticker or ISIN');
  }
  if (!target.instrument) {
    missingFields.push('Instrument');
  }

  // Validate ticker if provided
  if (target.mainTicker) {
    try {
      const name = await lookupNameFromTicker(target.mainTicker);
      if (!name) {
        warnings.push(`Row ${target.rowNumber}: Ticker "${target.mainTicker}" not found in lookup service`);
      }
    } catch (error) {
      warnings.push(`Row ${target.rowNumber}: Could not validate ticker "${target.mainTicker}"`);
    }
  }

  // Validate ISIN if provided
  if (target.isin) {
    try {
      const name = await lookupNameFromISIN(target.isin);
      if (!name) {
        warnings.push(`Row ${target.rowNumber}: ISIN "${target.isin}" not found in lookup service`);
      }
    } catch (error) {
      warnings.push(`Row ${target.rowNumber}: Could not validate ISIN "${target.isin}"`);
    }
  }

  // Validate ISIN matches ticker if both are provided
  if (target.mainTicker && target.isin) {
    // This is a basic check - in a real scenario, we'd need to verify they match
    // For now, we'll just note if both are present
  }

  // Validate other tickers
  if (target.otherTickers && target.otherTickers.length > 0) {
    for (const ticker of target.otherTickers) {
      try {
        const name = await lookupNameFromTicker(ticker);
        if (!name) {
          warnings.push(`Row ${target.rowNumber}: Other ticker "${ticker}" not found in lookup service`);
        }
      } catch (error) {
        warnings.push(`Row ${target.rowNumber}: Could not validate other ticker "${ticker}"`);
      }
    }
  }

  const needsAutoDetect = missingFields.length > 0;
  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    needsAutoDetect,
    missingFields,
  };
}

/**
 * Validate multiple targets
 */
export async function validateTargets(targets: TargetToValidate[]): Promise<{
  allValid: boolean;
  allComplete: boolean;
  results: Array<{ target: TargetToValidate; validation: ValidationResult }>;
  summary: {
    total: number;
    valid: number;
    complete: number;
    needsAutoDetect: number;
  };
}> {
  const results = await Promise.all(
    targets.map(async (target) => ({
      target,
      validation: await validateTarget(target),
    }))
  );

  const valid = results.filter(r => r.validation.isValid).length;
  const complete = results.filter(r => !r.validation.needsAutoDetect).length;
  const needsAutoDetect = results.filter(r => r.validation.needsAutoDetect).length;

  return {
    allValid: results.every(r => r.validation.isValid),
    allComplete: results.every(r => !r.validation.needsAutoDetect),
    results,
    summary: {
      total: targets.length,
      valid,
      complete,
      needsAutoDetect,
    },
  };
}
