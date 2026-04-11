import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.carbon_estimator import estimate_emissions

def test_estimations():
    print("Testing Carbon Emission Estimations...")
    
    # Test 1: Manual Burned Area
    res1 = estimate_emissions(burned_area_ha=150.0, forest_type="tropical_dry_forest")
    print("\nTest 1: 150ha Tropical Dry Forest")
    print(f"  Burned Area: {res1['burned_area_ha']} ha")
    print(f"  CO2 Equivalent: {res1['emissions']['co2_equivalent']} tonnes")
    assert res1['burned_area_ha'] == 150.0
    assert res1['emissions']['co2_equivalent'] > 0

    # Test 2: Auto-estimate from FRP
    # FRP=100 MW, Duration=6h
    # FRE = 100 * 6 * 3600 = 2,160,000 MJ
    # Burned Area = 2,160,000 * 0.00015 = 324 ha
    res2 = estimate_emissions(burned_area_ha=0, frp_mw=100.0, duration_hours=6, forest_type="boreal_forest")
    print("\nTest 2: FRP=100MW, 6h, Boreal Forest")
    print(f"  Estimated Area: {res2['burned_area_ha']} ha")
    print(f"  CO2 Equivalent: {res2['emissions']['co2_equivalent']} tonnes")
    assert res2['burned_area_ha'] == 324.0
    
    # Test 3: Forest Type Sensitivity
    res3a = estimate_emissions(burned_area_ha=100.0, forest_type="peat")
    res3b = estimate_emissions(burned_area_ha=100.0, forest_type="grassland")
    print("\nTest 3: Forest Type Sensitivity (100ha)")
    print(f"  Peat CO2eq:      {res3a['emissions']['co2_equivalent']} tonnes")
    print(f"  Grassland CO2eq: {res3b['emissions']['co2_equivalent']} tonnes")
    assert res3a['emissions']['co2_equivalent'] > res3b['emissions']['co2_equivalent']

    print("\nAll logical tests passed!")

if __name__ == "__main__":
    test_estimations()
