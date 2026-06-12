package com.agent.mvp.coach;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import com.agent.mvp.coach.dto.RequirementBreakdownRequest;
import com.agent.mvp.coach.service.CoachService;
import com.agent.mvp.common.exception.UnauthorizedException;
import org.junit.jupiter.api.Test;

class CoachControllerTest {

    @Test
    void breakdownShouldRequireAuthentication() {
        CoachController controller = new CoachController(mock(CoachService.class));

        assertThrows(
                UnauthorizedException.class,
                () ->
                        controller.breakdown(
                                new RequirementBreakdownRequest("build rag", null, null), null));
    }
}
