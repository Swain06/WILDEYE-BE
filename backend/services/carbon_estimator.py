"""
Carbon emission estimation from forest fires.
Based on: IPCC methodology + Global Forest Watch emission factors.

Formula:
  CO2_emissions (tonnes) = Burned_Area (ha) × Biomass_Density (t/ha)
                           × Combustion_Factor × Emission_Factor

Where:
  Biomass_Density   = above-ground biomass per hectare by forest type
  Combustion_Factor = fraction of biomass actually burned (0.2–0.95)
  Emission_Factor   = CO2 released per tonne of dry matter burned (~1.58 tCO2/t)
"""

# Biomass density by forest type (tonnes of dry matter per hectare)
BIOMASS_DENSITY = {
    "tropical_rainforest":    250,
    "tropical_dry_forest":    120,
    "temperate_forest":       150,
    "boreal_forest":          90,
    "savanna_woodland":       40,
    "shrubland":              20,
    "grassland":              8,
    "peat":                   500,   # peatland fires are extremely carbon-dense
    "mangrove":               300,
    "default":                100
}

# Combustion factors (fraction of biomass burned)
COMBUSTION_FACTOR = {
    "tropical_rainforest":    0.35,
    "tropical_dry_forest":    0.55,
    "temperate_forest":       0.45,
    "boreal_forest":          0.30,
    "savanna_woodland":       0.70,
    "shrubland":              0.65,
    "grassland":              0.85,
    "peat":                   0.50,
    "mangrove":               0.40,
    "default":                0.45
}

EMISSION_FACTOR_CO2 = 1.58     # tCO2 per tonne dry matter
EMISSION_FACTOR_CH4 = 0.0056   # tCH4 per tonne dry matter
EMISSION_FACTOR_N2O = 0.00014  # tN2O per tonne dry matter

# Global warming potential (100 year)
GWP_CH4 = 28
GWP_N2O = 265

def estimate_burned_area_from_frp(frp_mw: float, duration_hours: float = 6) -> float:
    """
    Estimate burned area in hectares from Fire Radiative Power.
    FRP-to-area relationship based on Wooster et al. 2005.
    frp_mw: fire radiative power in megawatts
    duration_hours: estimated fire duration
    """
    # Fire Radiative Energy = FRP × duration
    fre_mj = frp_mw * duration_hours * 3600  # convert hours to seconds, MW to MJ/s
    # Empirical: ~1 MJ of FRE ≈ 0.00015 ha burned (varies by fuel type)
    burned_ha = fre_mj * 0.00015
    return round(burned_ha, 2)


def estimate_emissions(
    burned_area_ha: float,
    forest_type: str = "default",
    frp_mw: float = None,
    duration_hours: float = 6
) -> dict:
    """
    Estimate carbon emissions from a fire event.
    Returns CO2, CH4, N2O emissions in tonnes, plus CO2-equivalent.
    """
    if burned_area_ha <= 0 and frp_mw:
        burned_area_ha = estimate_burned_area_from_frp(frp_mw, duration_hours)

    forest_key = forest_type.lower().replace(" ", "_")
    biomass    = BIOMASS_DENSITY.get(forest_key, BIOMASS_DENSITY["default"])
    combustion = COMBUSTION_FACTOR.get(forest_key, COMBUSTION_FACTOR["default"])

    dry_matter_burned = burned_area_ha * biomass * combustion  # tonnes

    co2_tonnes = dry_matter_burned * EMISSION_FACTOR_CO2
    ch4_tonnes = dry_matter_burned * EMISSION_FACTOR_CH4
    n2o_tonnes = dry_matter_burned * EMISSION_FACTOR_N2O

    co2_equivalent = co2_tonnes + (ch4_tonnes * GWP_CH4) + (n2o_tonnes * GWP_N2O)

    # Context comparisons
    cars_equivalent      = co2_equivalent / 4.6        # avg car emits 4.6t CO2/year
    flights_equivalent   = co2_equivalent / 0.255      # avg flight London-NY = 0.255t CO2
    trees_to_offset      = co2_equivalent / 0.022      # avg tree absorbs 22kg CO2/year
    homes_powered        = co2_equivalent / 7.5        # avg home emits 7.5t CO2/year

    return {
        "burned_area_ha":       round(burned_area_ha, 2),
        "dry_matter_burned_t":  round(dry_matter_burned, 2),
        "emissions": {
            "co2_tonnes":       round(co2_tonnes, 2),
            "ch4_tonnes":       round(ch4_tonnes, 4),
            "n2o_tonnes":       round(n2o_tonnes, 4),
            "co2_equivalent":   round(co2_equivalent, 2)
        },
        "context": {
            "equivalent_cars_yearly":    round(cars_equivalent),
            "equivalent_flights":        round(flights_equivalent),
            "trees_needed_to_offset":    round(trees_to_offset),
            "equivalent_homes_yearly":   round(homes_powered)
        },
        "forest_type":      forest_type,
        "biomass_density":  biomass,
        "combustion_factor": combustion,
        "methodology":      "IPCC 2006 Guidelines + Wooster et al. 2005 FRP-area relationship"
    }
